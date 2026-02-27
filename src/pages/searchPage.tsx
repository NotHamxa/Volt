import { useOutletContext, useSearchParams } from 'react-router-dom';
import QuerySuggestions from "@/components/querySuggestions.tsx";
import { MainLayoutContext } from "@/pages/mainPage.tsx";

export default function SearchPage() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('query') || '';
    const { searchFilters } = useOutletContext<MainLayoutContext>();

    return <QuerySuggestions query={query} searchFilters={searchFilters} />;
}
