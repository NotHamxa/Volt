import { useOutletContext, useSearchParams } from 'react-router-dom';
import QuerySuggestions from "@/components/querySuggestions.tsx";
import { MainLayoutContext } from "@/pages/mainPage.tsx";

export default function SearchPage() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('query') || '';
    const { searchFilters, clearQuery } = useOutletContext<MainLayoutContext>();

    return <QuerySuggestions query={query} searchFilters={searchFilters} clearQuery={clearQuery} />;
}
