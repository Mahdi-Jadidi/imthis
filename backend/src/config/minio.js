const Minio = require('minio');
const env = require('./env');

const bucketName = env.minio.bucket;

const minioClient = new Minio.Client({
  endPoint: env.minio.endPoint,
  port: env.minio.port,
  useSSL: env.minio.useSSL,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

async function ensureBucket() {
  const exists = await minioClient.bucketExists(bucketName);

  if (!exists) {
    await minioClient.makeBucket(bucketName);
  }
}

async function uploadFile(buffer, filename, mimetype) {
  await ensureBucket();

  await minioClient.putObject(bucketName, filename, buffer, buffer.length, {
    'Content-Type': mimetype,
  });

  return filename;
}

async function getFileUrl(filename) {
  return minioClient.presignedGetObject(bucketName, filename, 60 * 60);
}

async function deleteFile(filename) {
  await minioClient.removeObject(bucketName, filename);
}

async function downloadFile(filename) {
  const stream = await getFileStream(filename);
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function getFileStream(filename) {
  return minioClient.getObject(bucketName, filename);
}

module.exports = {
  minioClient,
  ensureBucket,
  uploadFile,
  getFileUrl,
  deleteFile,
  downloadFile,
  getFileStream,
  bucketName,
};
