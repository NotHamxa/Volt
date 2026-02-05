import {
    DropdownMenu,
    DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {Check, SlidersHorizontal} from "lucide-react";
import React from "react";

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

    return (
        <div style={{marginRight:"10px"}}>
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <div className="hover:bg-white/10 rounded cursor-pointer transition-colors text-white">
                        <SlidersHorizontal size={24}/>
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Filters</DropdownMenuLabel>
                    <DropdownMenuSeparator/>
                    <MenuItem index={0} text={"Apps"}/>
                    <MenuItem index={1} text={"Files"}/>
                    <MenuItem index={2} text={"Folders"}/>
                    <MenuItem index={3} text={"Settings"}/>
                    <MenuItem index={3} text={"Commands"}/>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}


export default SearchQueryFilter;
