import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  // Work in UTC end to end: JS Dates are sent/read as UTC and the session time zone matches.
  timezone: 'Z',
  // Return DATE columns (dob) as 'YYYY-MM-DD' strings instead of JS Dates.
  dateStrings: ['DATE'],
});

pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});
