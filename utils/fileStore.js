const session = require('express-session');
const fs = require('fs');

class FileStore extends session.Store {
  constructor(path = 'sessions.json') {
    super();
    this.path = path;
    try {
      const data = fs.readFileSync(this.path, 'utf8');
      this.sessions = JSON.parse(data);
    } catch {
      this.sessions = {};
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.sessions));
    } catch (err) {
      console.error('Failed to write sessions file:', err);
    }
  }

  all(cb) {
    cb(null, Object.values(this.sessions).map((s) => JSON.parse(s)));
  }

  get(sid, cb) {
    const sess = this.sessions[sid];
    cb(null, sess ? JSON.parse(sess) : undefined);
  }

  set(sid, sess, cb) {
    this.sessions[sid] = JSON.stringify(sess);
    this._save();
    cb(null);
  }

  destroy(sid, cb) {
    delete this.sessions[sid];
    this._save();
    cb(null);
  }
}

module.exports = FileStore;
