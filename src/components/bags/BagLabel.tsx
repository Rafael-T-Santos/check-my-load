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
        fontSize: '9px',
        width: '100mm',
        height: '48mm',
        padding: '3mm',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#000',
        display: 'flex',
        flexDirection: 'row',
        gap: '3mm',
        overflow: 'hidden',
      }}
    >
      {/* Left: text info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <p style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cliente.codparc} - {cliente.nomeparc}
          </p>
          <p style={{ marginBottom: '1px' }}>
            <strong>Razão Social:</strong> {cliente.razaosocial}
          </p>
          <p style={{ marginBottom: '1px' }}>
            <strong>Cidade/UF:</strong> {cliente.nomecid}/{cliente.uf}
          </p>
          <p style={{ marginBottom: '1px' }}>
            <strong>End.:</strong> {cliente.nomeend}, {cliente.numend}
          </p>
          <p style={{ marginBottom: '1px' }}>
            <strong>Bairro:</strong> {cliente.nomebai}
          </p>
        </div>
        <p style={{ marginTop: '2px' }}>
          <strong>Nro. Único:</strong> {pedidos.join(', ')}
        </p>
      </div>

      {/* Right: QR code */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <QRCode value={timestamp} size={116} />
      </div>
    </div>
  );
}
