import {CSSProperties, useState} from 'react';

function App() {
    const [query, setQuery] = useState('');

    return (
        <div style={styles.mainContainer}>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                autoFocus
            />
        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        maxWidth: '600px',
        maxHeight: '100px',
        width: '600px',
        height: '100px',
        overflow: 'hidden',
    }
}

export default App;
