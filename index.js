const AWS = require("aws-sdk");
const { Tree } = require("./lib/Tree");
const busboy = require("busboy");
const crypto = require("crypto");
const path = require("path");
const formatDate = require("./lib/formatDate");

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
      .promise();

  const upload = async (
    req,
    res,
    { keepOriginalName = false, overrideMaxSize }
  ) => {
    return new Promise((resolve, reject) => {
      try {
        const { destination, max_size } = req.query;
        console.log("orig", keepOriginalName);

        let filesArray = [];
        let failed = [];

        let bb = busboy({
          headers: req.headers,
          limits: {
            fileSize: parseInt(overrideMaxSize || max_size || 1024 * 1024 * 10),
          },
        });
        bb.on("file", function (fieldname, stream, info) {
          const { filename, encoding, mimeType } = info;

          filesArray.push({
            filename: filename.replace(/ /g, "_"),
            encoding,
            mimeType,
            chunks: [],
          });

          stream.on("data", function (data) {
            filesArray[filesArray.length - 1]["chunks"].push(data);
          });

          stream.on("limit", function () {
            console.log(`File [${filename}] exceeds allowed size limit`);
            failed.push(filename);
            filesArray.pop();
          });

          stream.on("end", function () {
            console.log("File [" + filename + "] Finished");
          });
        });
        bb.on("finish", function () {
          const dest = parseKey(destination);

          let queue = filesArray.length;
          console.log("queue  on start", queue);

          filesArray.forEach((f, index) => {
            const fName = keepOriginalName
              ? f.filename
              : crypto.randomUUID() + path.extname(f.filename);

            s3.upload(
              {
                Bucket: bucketName,
                Key: normalize(dest + "/" + fName),
                Body: Buffer.concat(f.chunks),
                ContentEncoding: f.encoding,
                ContentType: f.mimeType,
                ACL: "public-read",
              },
              (err, result) => {
                if (err) throw err;

                queue -= 1;

                if (queue === 0) {
                  resolve({
                    failed,
                    uploaded: filesArray.map((f) => f.filename),
                  });
                }
              }
            );
          });
        });
        req.pipe(bb);
      } catch (error) {
        reject(error);
      }
    });
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

              contents.forEach((content) => {
                allKeys.push({
                  Key: content.Key,
                  Size: content.Size,
                  LastModified: content.LastModified,
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

  const s3delete = async (keysArray) =>
    s3.deleteObjects(
      {
        Bucket: bucketName,
        Delete: {
          Objects: keysArray.map((key) => {
            console.log("deleting", key);
            return {
              Key: key,
            };
          }),
        },
      },
      (err, res) => {
        if (err) {
          console.error("Error while deleting object");
          throw err;
        }

        console.log("Deleted object ", res);
      }
    );

  const s3copy = async (newKeys, oldKeys) => {
    return new Promise((resolve, reject) => {
      let count = oldKeys.length;

      try {
        for (const [index, val] of oldKeys.entries()) {
          console.log("Processing object copy", val);
          console.log("index", index);

          s3.copyObject(
            {
              Bucket: bucketName,
              CopySource: bucketName + "/" + val,
              Key: parseKey(newKeys[index]),
            },
            (err, res) => {
              if (err) {
                console.error(
                  `Error while copying object from  ${
                    bucketName + "/" + val
                  } to  ${parseKey(newKeys[index])}`
                );
                throw err;
              }
              console.log("object copied to ", parseKey(newKeys[index]));
              count -= 1;
              console.log("objects left", count);
              if (count === 0) {
                resolve(oldKeys);
              }
            }
          );
        }
      } catch (error) {
        reject(error);
      }
    });
  };

  const rename = async (oldPath, newPath) => {
    const oldKeys = await getKeyWithSubkeys(oldPath);

    const newKeys = oldKeys.map((k) => {
      return parseKey(newPath) + k.slice(oldKeys[0].length);
    });

    const keysToDelete = await s3copy(newKeys, oldKeys);

    await s3delete(keysToDelete);
  };

  const remove = async (keys) => await s3delete(await getKeyWithSubkeys(keys));

  const copy = async (target, files) => await move(target, files, true);

  const move = async (target, files, keepOrigin = false) => {
    const oldKeys = await getKeyWithSubkeys(files);

    let prefix, marker;

    const newKeys = oldKeys.map((k, ind) => {
      if (
        prefix === undefined ||
        marker === undefined ||
        !k.slice(prefix.length + 1).startsWith(marker)
      ) {
        marker = k.split("/").length === 1 ? k : k.split("/").reverse()[0];
        prefix =
          k.split("/").length === 1 ? "" : k.slice(0, k.lastIndexOf("/"));
      }

      return parseKey(target) + "/" + normalize(k.slice(prefix.length));
    });
    console.log("old keys", oldKeys);
    console.log("new keys", newKeys);

    const keysToDelete = await s3copy(newKeys, oldKeys);

    if (keepOrigin === false) {
      console.log("keys to delete", keysToDelete);

      await s3delete(keysToDelete);
    }
  };

  const map = async (root = bucketName, Delimiter = "", Prefix = "") => {
    const tree = new Tree(root);
    const top = tree.find(root);
    top.dir = true;
    top.info = {
      mb: 0,
      bytes: 0,
      created: "n/a",
    };

    const data = await listObjects(Prefix);

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
              created: formatDate(ob["LastModified"]),
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
