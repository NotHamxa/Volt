import { SearchQueryT } from "@/interfaces/searchQuery.ts";

export const isSameApp = (a: SearchQueryT, b: SearchQueryT) =>
    a.appId === b.appId &&
    a.path === b.path &&
    a.name === b.name &&
    a.type === b.type &&
    a.source === b.source;
