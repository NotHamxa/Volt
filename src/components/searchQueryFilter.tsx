import {
    DropdownMenu,
    DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {Check, SlidersHorizontal} from "lucide-react";
import React, {useEffect} from "react";

interface SearchQueryFilterT{
    filters: boolean[],
    setFilters:React.Dispatch<React.SetStateAction<boolean[]>>;
}

function SearchQueryFilter({filters,setFilters}:SearchQueryFilterT) {

    function handlePress(index: number) {
        setFilters(prev =>
            prev.map((value, i) => (i === index ? !value : value))
        );
    }

    useEffect(() => {
        console.log(filters);
    }, [filters]);

    function MenuItem({ text, index }: { text: string; index: number }) {
        return (
            <DropdownMenuItem
                onSelect={(e) => {
                    e.preventDefault();
                    handlePress(index);
                }}
            >
            <span className="flex justify-between items-center w-full">
                {text}
                {filters[index] ? <Check size={18} /> : null}
            </span>
            </DropdownMenuItem>
        );
    }

    const activeCount = filters.filter(Boolean).length;
    const totalCount = filters.length;

    return (
        <div className="mr-2.5 shrink-0">
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/10 rounded-lg cursor-pointer transition-colors text-white/50 hover:text-white/70">
                        <SlidersHorizontal size={15}/>
                        {activeCount < totalCount && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/50">{activeCount}</span>
                        )}
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Filters</DropdownMenuLabel>
                    <DropdownMenuSeparator/>
                    <MenuItem index={0} text={"Apps"}/>
                    <MenuItem index={1} text={"Files"}/>
                    <MenuItem index={2} text={"Folders"}/>
                    <MenuItem index={3} text={"Settings"}/>
                    <MenuItem index={4} text={"Commands"}/>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}


export default SearchQueryFilter;
