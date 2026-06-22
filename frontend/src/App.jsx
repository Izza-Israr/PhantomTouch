import { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [status, setStatus] = useState('checking...');

  useEffect(() => {
    axios.get('http://localhost:5000/api/health')
      .then(res => setStatus(res.data.message))
      .catch(() => setStatus('backend not reachable'));
  }, []);

  return <h1>{status}</h1>;
}

export default App;