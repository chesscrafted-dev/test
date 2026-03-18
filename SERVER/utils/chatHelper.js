const crypto = require('crypto');
const getChatId = (uid1, uid2) => {
  const sortedIds = [uid1, uid2].sort();
  return crypto.createHash('sha256').update(sortedIds.join('_')).digest('hex');
};
module.exports = { getChatId };
