import {CSSProperties, useState} from 'react';
import QueryPage from "@/pages/queryPage.tsx";


function App() {

    const [currentPage,setCurrentPage] = useState<string>("QueryPage");

    return (
        <div style={styles.mainContainer}>
            {currentPage==="QueryPage"?<QueryPage/>:null}
        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: '800px',
        maxWidth: '800px',
        height: '500px',
        overflow: 'hidden',
        background: "rgba(10,10, 10, .9)",
    },

};

export default App;
