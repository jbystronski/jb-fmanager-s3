<p>S3 service package for <a href="https://github.com/jbystronski/jb-fmanager-react">@jb_fmanager/react</a> in nodejs.</p>

<h4>Install:</h4>

```bash
npm i @jb_fmanager/s3

yarn add @jb_fmanager/s3
```

<h4>Use:</h4>

<p>Depending on your framework's specs you have to write a route that points to a relevant service function and pass the right arguments. Examples below show a basic setup in Express with default error handling behaviour. Steps can be reproduced in similar fashion in any nodejs based environment.</p>

```js
const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config(); // to parse your config variables from the .env file as shown below (optional, yet recommended)

const jbfm_s3 = require("@jb_fmanager/s3")({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  bucketName: process.env.AWS_BUCKET_NAME,
  endpoint: "your/s3/bucket/endpoint/url",
  // any other s3 configuration you want to include, the one above is the required minimum
});

const prefix = "/api/fm"; // prefix your routes with the same namespace used in the frontend component
```

<strong>[get] map</strong>

<span>Maps the s3 bucket and returns a parent / child file tree structure</span>

```js
app.get(`${prefix}/map`, (req, res, next) =>
  jbfm_s3
    .map()
    .then((data) => res.status(200).send(data))
    .catch(next)
);
```

<strong>[get] create_folder</strong>

<span>Creates new directory in the specified path</span>

```js
app.get(`${prefix}/create_folder`, ({ query }, res, next) =>
  jbfm_s3
    .create_folder(query.path, query.name) // pass query parameters: path, name
    .then((_) => res.status(200).send({}))
    .catch(next)
);
```

<strong>[get] rename</strong>

<span>Renames am object and all objects down in hierarchy</span>

```js
app.get(`${prefix}/rename`, ({ query }, res, next) =>
  jbfm_s3
    .rename(query.oldPath, query.newPath) // pass query parameters: oldPath, newPath
    .then((_) => res.status(200).send({}))
    .catch(next)
);
```

<strong>[post] remove</strong>

<span>Removes a number of objects</span>

```js
app.post(`${prefix}/remove`, ({ body }, res, next) =>
  jbfm_s3
    .remove(body) // pass the request body
    .then((_) => res.status(200).send({}))
    .catch(next)
);
```

<strong>[post] copy</strong>

<span>Copies a number of objects from one path to another</span>

```js
app.post(`${prefix}/copy`, ({ query, body }, res, next) =>
  jbfm_s3
    .copy(query.target, body) // pass the requst body and query parameter: target
    .then((_) => res.status(200).send({}))
    .catch(next)
);
```

<strong>[post] move</strong>

<span>Moves a number of objects from one path to another</span>

```js
app.post(`${prefix}/move`, ({ query, body }, res, next) =>
  jbfm_s3
    .move(query.target, body) // pass query parameter target and request body
    .then((_) => res.status(200).send({}))
    .catch(next)
);
```

<strong>[post] upload</strong>

<span>Saves a number of objects into the given destination</span>

```js
app.post(`${prefix}/upload`, (req, res, next) =>
  jbfm_s3
    .upload(req, res, req.query.destination, req.query.max_size) // pass http request and response
    .then((result) => res.status(200).send(result))
    .catch(next)
);
```

<p>Upload relies on a multipart/form-data type request. It can vary how your framework handles such requests. It might be passed with no issues or it might be blocked on the way, due reasons such as your framework not supporting multipart data in vanilla form or it may fall half-way when the framework tries to process it through it's default parser. What you should do is to disable the default parser on this specific route or, depending on your framework, add a custom parser or middleware that will pass the request onwards.</p>

```js
// Next.js - blocking default parser on "api/fm/upload" route example

export const config = {
  api: {
    bodyParser: false,
  },
};

// process upload
```

```js
// fastify - adding a custom multipart/form-data parser which will pass the request onwards

const fastify = require("fastify")({});

fastify.addContentTypeParser(
  "multipart/form-data",
  function (request, payload, done) {
    done(null, payload);
  }
);

// then inside your route

upload(request.raw, response.raw);

// in fastify the instance of IncomingMessage can be found under request.raw,
```
