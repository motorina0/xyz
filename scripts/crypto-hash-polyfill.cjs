const crypto = require('node:crypto');

if (typeof crypto.hash !== 'function') {
  crypto.hash = (algorithm, data, outputEncoding) => {
    const hash = crypto.createHash(algorithm);
    hash.update(data);
    return hash.digest(outputEncoding);
  };
}
