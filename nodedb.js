import fs from "fs/promises";
import path from "path";

export class Client {
  constructor(dbPath) {
    this.dbPath = path.resolve(dbPath);
    this.initializeDB();
  }

  async initializeDB() {
    try {
      const fileExists = await fs.access(this.dbPath).then(() => true).catch(() => false);
      if (!fileExists) {
        await fs.writeFile(this.dbPath, "{}", "utf8");
      } else {
        const data = await fs.readFile(this.dbPath, "utf8");
        if (data.trim() === "") {
          await fs.writeFile(this.dbPath, "{}", "utf8");
        }
      }
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    }
  }

  async get(key) {
    try {
      const data = await fs.readFile(this.dbPath, "utf8");
      if (data.trim() === "") {
        await fs.writeFile(this.dbPath, "{}", "utf8");
        return null;
      }
      const json = JSON.parse(data);
      return json[key];
    } catch (error) {
      console.error("Error getting value for key:", error);
      throw error;
    }
  }

  async set(key, value) {
    try {
      const data = await fs.readFile(this.dbPath, "utf8");
      if (data.trim() === "") {
        await fs.writeFile(this.dbPath, "{}", "utf8");
        return null;
      }
      const json = JSON.parse(data);
      json[key] = value;
      await fs.writeFile(this.dbPath, JSON.stringify(json, null, 2), "utf8");
    } catch (error) {
      console.error("Error setting key-value pair:", error);
      throw error;
    }
  }

  async delete(key) {
    try {
      const data = await fs.readFile(this.dbPath, "utf8");
      if (data.trim() === "") {
        await fs.writeFile(this.dbPath, "{}", "utf8");
        return null;
      }
      const json = JSON.parse(data);
      delete json[key];
      await fs.writeFile(this.dbPath, JSON.stringify(json, null, 2), "utf8");
    } catch (error) {
      console.error("Error deleting key:", error);
      throw error;
    }
  }

  // New method to list all keys
  async list(prefix = '') {
    try {
      const data = await fs.readFile(this.dbPath, "utf8");
      if (data.trim() === "") {
        return [];
      }
      const json = JSON.parse(data);
      let keys = Object.keys(json);

      // Filter keys based on the prefix if provided
      if (prefix!== '') {
        keys = keys.filter(key => key.startsWith(prefix));
      }

      return keys;
    } catch (error) {
      console.error("Error listing keys:", error);
      throw error;
    }
  }
}