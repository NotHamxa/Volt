// Whether the tour is running. The AI view checks it: with nothing set up it
// would otherwise send you to Settings and pull the tour off its own steps.
let touring = false;

export const isTouring = () => touring;

export function setTouring(value: boolean) {
    touring = value;
}
