import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

const db = SQLite.openDatabase('autobidder.db');

export const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`,
        [],
        () => {
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS prompt_template (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              template TEXT NOT NULL,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );`,
            [],
            () => {
              tx.executeSql(
                `CREATE TABLE IF NOT EXISTS skills (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  skill TEXT UNIQUE NOT NULL,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );`,
                [],
                () => {
                  tx.executeSql(
                    `CREATE TABLE IF NOT EXISTS bids_cache (
                      project_id INTEGER PRIMARY KEY,
                      title TEXT,
                      bid_amount REAL,
                      status TEXT,
                      applied_at TEXT,
                      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );`,
                    [],
                    () => resolve(),
                    (_, error) => reject(error)
                  );
                },
                (_, error) => reject(error)
              );
            },
            (_, error) => reject(error)
          );
        },
        (_, error) => reject(error)
      );
    });
  });
};

export const saveConfig = async (key, value) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        'INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        [key, JSON.stringify(value)],
        (_, result) => resolve(result),
        (_, error) => reject(error)
      );
    });
  });
};

export const getConfig = async (key) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        'SELECT value FROM config WHERE key = ?',
        [key],
        (_, { rows }) => {
          if (rows.length > 0) {
            try {
              resolve(JSON.parse(rows.item(0).value));
            } catch (e) {
              resolve(rows.item(0).value);
            }
          } else {
            resolve(null);
          }
        },
        (_, error) => reject(error)
      );
    });
  });
};

export const getAllConfig = async () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        'SELECT key, value FROM config',
        [],
        (_, { rows }) => {
          const config = {};
          for (let i = 0; i < rows.length; i++) {
            const row = rows.item(i);
            try {
              config[row.key] = JSON.parse(row.value);
            } catch (e) {
              config[row.key] = row.value;
            }
          }
          resolve(config);
        },
        (_, error) => reject(error)
      );
    });
  });
};

export const savePromptTemplate = async (template) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        'INSERT OR REPLACE INTO prompt_template (id, template, updated_at) VALUES (1, ?, datetime("now"))',
        [template],
        (_, result) => resolve(result),
        (_, error) => reject(error)
      );
    });
  });
};

export const getPromptTemplate = async () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        'SELECT template FROM prompt_template WHERE id = 1',
        [],
        (_, { rows }) => {
          if (rows.length > 0) {
            resolve(rows.item(0).template);
          } else {
            resolve('');
          }
        },
        (_, error) => reject(error)
      );
    });
  });
};

export const saveSkills = async (skills) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql('DELETE FROM skills', [], () => {
        const insertPromises = skills.map((skill) => {
          return new Promise((res, rej) => {
            tx.executeSql(
              'INSERT INTO skills (skill) VALUES (?)',
              [skill],
              () => res(),
              (_, err) => rej(err)
            );
          });
        });
        Promise.all(insertPromises)
          .then(() => resolve())
          .catch(reject);
      });
    });
  });
};

export const getSkills = async () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        'SELECT skill FROM skills ORDER BY skill',
        [],
        (_, { rows }) => {
          const skills = [];
          for (let i = 0; i < rows.length; i++) {
            skills.push(rows.item(i).skill);
          }
          resolve(skills);
        },
        (_, error) => reject(error)
      );
    });
  });
};

export const saveBidsCache = async (bids) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql('DELETE FROM bids_cache', [], () => {
        const insertPromises = bids.map((bid) => {
          return new Promise((res, rej) => {
            tx.executeSql(
              'INSERT INTO bids_cache (project_id, title, bid_amount, status, applied_at) VALUES (?, ?, ?, ?, ?)',
              [bid.project_id, bid.title, bid.bid_amount, bid.status || 'applied', bid.applied_at],
              () => res(),
              (_, err) => rej(err)
            );
          });
        });
        Promise.all(insertPromises)
          .then(() => resolve())
          .catch(reject);
      });
    });
  });
};

export const getBidsCache = async () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        'SELECT * FROM bids_cache ORDER BY applied_at DESC',
        [],
        (_, { rows }) => {
          const bids = [];
          for (let i = 0; i < rows.length; i++) {
            bids.push(rows.item(i));
          }
          resolve(bids);
        },
        (_, error) => reject(error)
      );
    });
  });
};

