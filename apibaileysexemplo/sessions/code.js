const manager = require('./sessionManager');

// Wrappers to create instances scoped for the admin or user panel
function connectAdmin(name, webhook, apiKey, force = false) {
  const id = `admin:${name}`;
  return manager.createInstance(id, webhook, apiKey, force);
}

function connectUser(name, webhook, apiKey, force = false) {
  const id = `user:${name}`;
  return manager.createInstance(id, webhook, apiKey, force);
}

module.exports = {
  ...manager,
  connectAdmin,
  connectUser
};
