import bangs from "@/data/bangs.json";
import {BangData} from "@/interfaces/bang.ts";

async function handleBangs(query: string) {
    const words = query.trim().split(" ");
    const possibleBang = words[words.length - 1];
    const shortcut = possibleBang.startsWith("!") ? possibleBang.slice(1) : null;

    let bangData = bangs.find((bang) => bang.t === shortcut);
    const searchTerm = words.slice(0, -1).join(" ");

    if (!bangData) {
        bangData = bangs.find((bang) => bang.t === "g");
    }

    if (bangData) {
        const url = bangData.u.replace("{{{s}}}", encodeURIComponent(searchTerm));
        window.electron.openExternal(url);
    }
}


async function getBangData(query: string): Promise<BangData | null> {
    const words = query.trim().split(" ");
    const possibleBang = words[words.length - 1];
    const shortcut = possibleBang.startsWith("!") ? possibleBang.slice(1) : null;

    const bangData = bangs.find((bang) => bang.t === shortcut);
    return bangData as BangData ?? null;
}


export {handleBangs,getBangData};
