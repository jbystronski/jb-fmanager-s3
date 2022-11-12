const AWS = require("aws-sdk");
const { Tree } = require("./lib/Tree");
const busboy = require("busboy");

const jbfm_s3 = ({
  accessKeyId,
  secretAccessKey,
  bucketName,
  endpoint,
  ...otherConfigs
}) => {
  const s3 = new AWS.S3({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint,
    s3ForcePathStyle: true,
    ...otherConfigs,
  });

  const normalize = (str) => str.replace(/^\/+|\/+$/g, "");

  const create_folder = (key, name) =>
    s3
      .putObject({
        Bucket: bucketName,
        Key: normalize(`${getS3Key(key)}/${name}`),
      })
      .promise()
      .catch(console.error);

  const upload = async (req, res, target, max_size) => {
    let filesArray = [];

    let bb = busboy({ headers: req.headers });
    bb.on("file", function (fieldname, stream, info) {
      const { filename } = info;

      filesArray.push({
        filename,
        chunks: [],
      });

      stream.on("data", function (data) {
        filesArray[filesArray.length - 1]["chunks"].push(data);
      });
      stream.on("end", function () {
        console.log("File [" + filename + "] Finished");
      });
    });
    bb.on("finish", function () {
      filesArray.forEach((f) =>
        s3
          .upload({
            Bucket: bucketName,
            Key: f.filename,
            Body: Buffer.concat(f.chunks),
            ACL: "public-read",
          })
          .promise()
      );

      // res.status(304).send({});
    });
    req.pipe(bb);
  };

  const parseKey = (key) => normalize(getS3Key(key));

  const getS3Key = (key) =>
    key.startsWith(bucketName) ? key.slice(bucketName.length) : key;

  const listObjects = (prefix) => {
    return new Promise((resolve, reject) => {
      try {
        let params = {
          Bucket: bucketName,
          Prefix: prefix,
          MaxKeys: 1000,
          Delimiter: prefix,
        };

        const allKeys = [];
        listAllKeys();

        function listAllKeys() {
          s3.listObjectsV2(params, (err, data) => {
            if (err) {
              reject(err);
            } else {
              const contents = data.Contents;
              console.log("C", contents);
              contents.forEach((content) => {
                allKeys.push({
                  Key: content.Key,
                  Size: content.Size,
                  lastModified: content.LastModified,
                });
              });

              if (data.IsTruncated) {
                params.ContinuationToken = data.NextContinuationToken;
                listAllKeys();
              } else {
                resolve(allKeys);
              }
            }
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  };

  const getKeyWithSubkeys = async (keys) => {
    let wholeData = [];

    if (!Array.isArray(keys)) {
      keys = [keys];
    }

    for (const key of keys) {
      const subset = await listObjects(parseKey(key) + "/");

      wholeData = [...wholeData, parseKey(key), ...subset.map((o) => o.Key)];
    }

    return wholeData;
  };

  const s3Delete = async (keysArray) =>
    s3
      .deleteObjects({
        Bucket: bucketName,
        Delete: {
          Objects: keysArray.map((key) => {
            return {
              Key: key,
            };
          }),
        },
      })
      .promise()
      .catch(console.error);

  const s3copy = async (newKeys, oldKeys) =>
    oldKeys.forEach((oldKey, index) =>
      s3
        .copyObject({
          Bucket: bucketName,
          CopySource: bucketName + "/" + oldKey,
          Key: parseKey(newKeys[index]),
        })
        .promise()
        .catch(console.error)
    );

  const rename = async (oldPath, newPath) => {
    const oldKeys = await getKeyWithSubkeys(oldPath);

    const newKeys = oldKeys.map((k) => {
      return parseKey(newPath) + k.slice(oldKeys[0].length);
    });

    s3copy(newKeys, oldKeys)
      .then((r) => s3Delete(oldKeys).catch(console.error))
      .catch(console.error);
  };

  const remove = async (keys) => await s3Delete(await getKeyWithSubkeys(keys));

  const copy = async (target, files) => await move(target, files, true);

  const move = async (target, files, keepOrigin = false) => {
    const oldKeys = await getKeyWithSubkeys(files);

    let prefix, marker;

    const newKeys = oldKeys.map((k, ind) => {
      if (
        !prefix ||
        !marker ||
        !k.slice(prefix.length + 1).startsWith(marker)
      ) {
        marker = k.split("/").reverse()[0];
        prefix = k.slice(0, k.lastIndexOf("/"));
      }

      return parseKey(target) + "/" + normalize(k.slice(prefix.length));
    });

    s3copy(newKeys, oldKeys)
      .then((r) => {
        if (keepOrigin === false) {
          s3Delete(oldKeys).catch(console.error);
        }
      })
      .catch(console.error);
  };

  const map = async (root = bucketName, Delimiter = "", Prefix = "") => {
    const tree = new Tree(root);
    tree.find(root).dir = true;

    const data = await listObjects(Prefix);
    console.log("d", data);

    for (const ob of data) {
      ob.Key.split("/").reduce((parent, child) => {
        if (!tree.find(parent + "/" + child)) {
          tree.insert({
            id: parent + "/" + child,
            parentNodeId: parent,
            dir: !ob["Size"],
            info: {
              mb: (ob["Size"] / 1024 ** 2).toFixed(2),
              bytes: ob["Size"],
            },
          });
        }

        return parent + "/" + child;
      }, root);
    }

    return [tree.root];
  };

  return {
    map,
    rename,
    remove,
    create_folder,
    copy,
    move,
    upload,
  };
};

module.exports = jbfm_s3;
