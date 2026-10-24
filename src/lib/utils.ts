import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * The type scale defined in index.css (`text-11` is 11px). tailwind-merge only
 * knows Tailwind's own t-shirt sizes, and reads any other `text-*` as a
 * colour, so without this, `text-11` lost to a component's default `text-sm`
 * and could knock out a real colour class beside it. Keep in step with the
 * `--text-*` tokens there.
 */
const TYPE_SCALE = ["9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "13.5", "14", "15", "17", "18", "42"]

const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: TYPE_SCALE },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
