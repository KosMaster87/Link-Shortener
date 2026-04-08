/**
 * @fileoverview PostgreSQL Connection Pool
 * @description Richtet den pg.Pool ein und exportiert ihn für alle Services.
 *   Verbindung läuft über Unix-Socket mit Peer-Authentifizierung.
 * @module src/db/index
 */
import pg from "pg";
import { config } from "../config.js";

const poolConfig = config.database.url
  ? {
      connectionString: config.database.url,
      ssl: config.isProduction ? { rejectUnauthorized: true } : false,
    }
  : {
      host: config.database.host,
      port: config.database.port || undefined,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password || undefined,
    };

export const pool = new pg.Pool(poolConfig);
