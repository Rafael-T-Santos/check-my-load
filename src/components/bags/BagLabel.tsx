import QRCode from 'react-qr-code';

export interface ClienteData {
  codparc: number;
  nomeparc: string;
  razaosocial: string;
  nomecid: string;
  uf: string;
  nomeend: string;
  numend: string;
  nomebai: string;
}

interface BagLabelProps {
  cliente: ClienteData;
  pedidos: string[];
  timestamp: string;
}

export function BagLabel({ cliente, pedidos, timestamp }: BagLabelProps) {
  return (
    <div
      id="bag-label-root"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        width: '80mm',
        padding: '6mm',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#000',
      }}
    >
      <p style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>
        {cliente.codparc} - {cliente.nomeparc}
      </p>
      <p style={{ marginBottom: '2px' }}>
        <strong>Razão Social:</strong> {cliente.razaosocial}
      </p>
      <p style={{ marginBottom: '2px' }}>
        <strong>Cidade/UF:</strong> {cliente.nomecid}/{cliente.uf}
      </p>
      <p style={{ marginBottom: '2px' }}>
        <strong>Endereço:</strong> {cliente.nomeend}
      </p>
      <p style={{ marginBottom: '6px' }}>
        <strong>Número</strong> {cliente.numend} <strong>Bairro</strong> {cliente.nomebai}
      </p>
      <p style={{ marginBottom: '8px' }}>
        <strong>Nro. Único:</strong> {pedidos.join(', ')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <QRCode value={timestamp} size={96} />
      </div>
    </div>
  );
}
