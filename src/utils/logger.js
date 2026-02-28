import winston from 'winston';
import { env } from '../config.js';

const { combine, timestamp, json, colorize, simple } = winston.format;

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.NODE_ENV === 'production'
    ? combine(timestamp(), json())
    : combine(colorize(), simple()),
  transports: [
    new winston.transports.Console(),
  ],
});

export default logger;
