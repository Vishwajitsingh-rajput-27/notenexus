const mongoose = require('mongoose');
const log      = require('../utils/logger')('db');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    log.db('MongoDB connected', { host: conn.connection.host });
  } catch (error) {
    log.error('MongoDB connection failed', error);
    process.exit(1);
  }
};

module.exports = connectDB;
