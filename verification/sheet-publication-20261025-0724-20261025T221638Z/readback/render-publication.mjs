import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('live-final.xlsx'));
const specs=[['01_good_documentation_jobs','K1:P12','main-employment.png'],['01_good_documentation_jobs','A1:F12','main-links.png'],['remote_jobs_pivot','A1:D12','remote-view.png']];
for(const [sheetName,range,name] of specs){const image=await wb.render({sheetName,range,scale:1.5,format:'png'});await fs.writeFile(name,new Uint8Array(await image.arrayBuffer()));console.log(name);}
