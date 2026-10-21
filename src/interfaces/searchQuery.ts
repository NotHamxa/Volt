export type CommandArgDef = {
    name: string;
    label?: string;
    description?: string;
    defaultValue?: string;
    required?: boolean;
}

export type SearchQueryT={
    name: string,
    type:string
    appId?:string
    path?:string
    source?:string
    // Apps only: the exe and arguments behind a Start entry, and a packaged
    // app's install folder.
    target?:string
    targetArgs?:string
    installLocation?:string
    normalisedName?:string
    shell?: "auto" | "cmd" | "powershell"
    args?: CommandArgDef[]
}
