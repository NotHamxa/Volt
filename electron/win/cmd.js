import { exec } from 'child_process';

export const executeUserCommand = (cmd) => {
    const fullCommand = `start cmd /k "${cmd}"`;

    exec(fullCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Stderr: ${stderr}`);
            return;
        }
        console.log(`Command executed successfully`);
    });
};

