import fs from 'fs';
import {fileURLToPath} from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDataPath = path.join(__dirname, 'appData/icons');


const getLinkFavicon = async (link) => {
    const fileName = `${link}.png`
    const filePath = path.join(appDataPath, fileName);
    if (!fs.existsSync(filePath)) {

    }
    else{

    }

}