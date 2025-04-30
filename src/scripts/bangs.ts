import bangs from "@/data/bangs.json";
import {BangData} from "@/interfaces/bang.ts";

async function handleBangs(bang:string){
    const shortcut = bang.split(" ")[0].replace("!","");

    const bangData = bangs.find((bang) => bang.t === shortcut);
    const searchTerm = bang.slice(shortcut.length+1).trim();
    let url = ""
    if (bangData) {
        url = bangData.u.replace("{{{s}}}", encodeURIComponent(searchTerm));
    } else {
        const bangData = bangs.find((bang) => bang.t === "g");
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        url = bangData.u.replace("{{{s}}}", encodeURIComponent(searchTerm));
    }
    window.electron.openExternal(url)
}

async function getBangData(bang: string): Promise<BangData | null> {
    const shortcut = bang.split(" ")[0].replace("!", "");
    const bangData = bangs.find((bang) => bang.t === shortcut);
    if (!bangData)
        return null

    return bangData as BangData;
}


export {handleBangs,getBangData};
