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
    normalisedName?:string
    shell?: "auto" | "cmd" | "powershell"
    args?: CommandArgDef[]
}
