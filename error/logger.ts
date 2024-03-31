import fs from 'fs';
import path from 'path';


/**
 * @param source name of the function where the error occured
 * @param error complete error stack
 */
export function logErrorToFile(source: string, error: any) {
  const logFilePath = path.join(__dirname, './error.log');
  const date = new Date();
  const estDate = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  fs.appendFile(logFilePath,
    `${estDate} - ${source}\n ${error.name} \n ${error.message}\n ${error.stack}\n `,
    (err: any) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
}