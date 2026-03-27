export interface OrderProduct {
  orderId: string;
  quantity: number;
  customerName?: string;
}

export interface Product {
  code: string;
  description: string;
  barcode: string;
  brand: string;
  orders: OrderProduct[];
  totalQuantity: number;
  checkedQuantity: number | null;
  isChecked: boolean;
  hasBarcode: boolean;
}

export interface Cargo {
  id: string;
  licensePlate: string;
  dock?: string | null;
  products: Product[];
}

export type ProductStatus = 'unchecked' | 'success' | 'warning';

export interface PhotoRecord {
  id: string;
  imageData: string; // base64 compressed
  observation: string;
  capturedAt: string;
}

// Bag (Sacola) types
export interface BagProduct {
  code: string;
  description: string;
  quantity: number;
  ordersOrigin: string[]; // which orders this quantity came from
}

export interface Bag {
  id: string; // barcode scanned from bag label
  createdAt: string;
  orders: string[]; // order IDs included
  products: BagProduct[];
  photos: PhotoRecord[];
}

export interface OrderInfo {
  orderId: string;
  customerName: string;
  products: {
    code: string;
    quantity: number;
  }[];
}

export interface CargoProgress {
  cargoId: string;
  products: Record<string, { checkedQuantity: number | null; isChecked: boolean }>;
  photos: PhotoRecord[];
  bags: Bag[];
  currentStep: 'brand-selection' | 'verification' | 'photos' | 'completed';
  lastUpdated: string;
  actionHistory: ActionHistoryEntry[];
}

export type AppStep = 'search' | 'brand-selection' | 'verification' | 'bags' | 'photos' | 'completed';

export interface BrandStatus {
  brand: string;
  total: number;
  checked: number;
  isComplete: boolean;
}

// Bag creation flow steps
export type BagCreationStep = 'order-selection' | 'product-selection' | 'bag-registration';

// Action History types
export type ActionType = 
  | 'product_checked'
  | 'product_warning'
  | 'bag_created'
  | 'bag_deleted'
  | 'progress_saved'
  | 'photo_captured'
  | 'conference_completed'
  | 'conference_started';

export interface ActionHistoryEntry {
  id: string;
  type: ActionType;
  timestamp: string;
  description: string;
  icon: string;
  metadata?: Record<string, unknown>;
}

// Filter types
export type ProductStatusFilter = 'all' | 'unchecked' | 'success' | 'warning';
export type BagAllocationFilter = 'all' | 'available' | 'partial' | 'allocated';

export interface ProductFilters {
  search: string;
  status: ProductStatusFilter;
  orders: string[];
  bagAllocation: BagAllocationFilter;
}
