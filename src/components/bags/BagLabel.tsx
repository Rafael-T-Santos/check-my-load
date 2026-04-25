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
        width: '100mm',
        height: '48mm',
        padding: '3mm',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header: código + nome, grande e centralizado */}
      <div style={{
        fontWeight: 'bold',
        fontSize: '15px',
        textAlign: 'center',
        marginBottom: '2mm',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderBottom: '1px solid #ccc',
        paddingBottom: '1mm',
      }}>
        {cliente.codparc} - {cliente.nomeparc}
      </div>

      {/* Body: dados à esquerda, QR + timestamp à direita */}
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, gap: '3mm', overflow: 'hidden' }}>
        <div style={{ flex: 1, fontSize: '14px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <p style={{ margin: '0 0 2px 0' }}><strong>Razão Social:</strong> {cliente.razaosocial}</p>
          <p style={{ margin: '0 0 2px 0' }}><strong>Cidade/UF:</strong> {cliente.nomecid}/{cliente.uf}</p>
          <p style={{ margin: '0 0 2px 0' }}><strong>End.:</strong> {cliente.nomeend}, {cliente.numend}</p>
          <p style={{ margin: '0 0 2px 0' }}><strong>Bairro:</strong> {cliente.nomebai}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: '2px' }}>
          <QRCode value={timestamp} size={88} />
          <span style={{ fontSize: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>{timestamp}</span>
        </div>
      </div>

      {/* Footer: Nro. Único */}
      <div style={{ fontSize: '11px', marginTop: '2mm', borderTop: '1px solid #ccc', paddingTop: '1mm' }}>
        <strong>Nro. Único:</strong> {pedidos.join(', ')}
      </div>
    </div>
  );
}
