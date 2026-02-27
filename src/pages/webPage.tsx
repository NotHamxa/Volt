import { MutableRefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import BangSuggestions from "@/components/bangSuggestions.tsx";

interface WebPageProps {
    selfQueryChangedRef: MutableRefObject<boolean>;
    setQueryFromBang: (value: string) => void;
}

export default function WebPage({ selfQueryChangedRef, setQueryFromBang }: WebPageProps) {
    const [searchParams] = useSearchParams();
    const bang = searchParams.get('query') || '';

    return (
        <BangSuggestions
            bang={bang}
            setQuery={setQueryFromBang}
            selfQueryChanged={selfQueryChangedRef.current}
        />
    );
}
