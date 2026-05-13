import { PaymentRecord } from '../types';

export const INITIAL_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay-1',
    plate: 'KCW822B',
    date: '2024-02-05',
    items: [
      { description: 'Parking fee', amount: 3000, currency: 'KSH' },
      { description: 'Mechanic for flexable', amount: 1000, currency: 'KSH' },
      { description: 'Mechanic for starter', amount: 500, currency: 'KSH' },
      { description: 'Mechanic for tension roller', amount: 500, currency: 'KSH' },
      { description: 'Battery service', amount: 400, currency: 'KSH' },
      { description: '2 terminals', amount: 500, currency: 'KSH' }
    ],
    total: 5900,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-2',
    plate: 'KCV328U',
    date: '2024-02-06',
    items: [
      { description: 'Oil service', amount: 600, currency: 'KSH' },
      { description: 'Head light and grill', amount: 500, currency: 'KSH' },
      { description: '6p clips', amount: 300, currency: 'KSH' }
    ],
    total: 1400,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-3',
    plate: 'KCU752X',
    date: '2024-02-07',
    items: [
      { description: 'Car wash engine only', amount: 500, currency: 'KSH' },
      { description: '4 tires opened', amount: 800, currency: 'KSH' },
      { description: 'Mechanic for rubber boosters and front break pads check up', amount: 1000, currency: 'KSH' },
      { description: 'Mechanic for break pads both side', amount: 500, currency: 'KSH' },
      { description: '3p rubber booster', amount: 1500, currency: 'KSH' },
      { description: 'Hydrolic oil', amount: 350, currency: 'KSH' }
    ],
    total: 4650,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-recent-1',
    plate: 'KDD606D',
    date: '2026-04-22',
    items: [
      { description: 'Parking fee', amount: 800, currency: 'KSH' },
      { description: '10 tires opened', amount: 2000, currency: 'KSH' },
      { description: 'Welding', amount: 600, currency: 'KSH' },
      { description: 'Car wash', amount: 800, currency: 'KSH' },
      { description: 'Wiring', amount: 3500, currency: 'KSH' },
      { description: 'Mechanic for oil cooler', amount: 4500, currency: 'KSH' },
      { description: 'Mechanic for engine head covers', amount: 1500, currency: 'KSH' },
      { description: 'Mechanic for breather X3', amount: 5000, currency: 'KSH' },
      { description: 'Mechanic for lining', amount: 3000, currency: 'KSH' },
      { description: 'Mechanic for fan belt', amount: 700, currency: 'KSH' },
      { description: 'Mechanic for break pads', amount: 800, currency: 'KSH' },
      { description: 'Mechanic for booster', amount: 600, currency: 'KSH' },
      { description: 'Mechanic for shocks', amount: 800, currency: 'KSH' },
      { description: 'Shocks front 2p', amount: 7000, currency: 'KSH' },
      { description: 'Dust cover', amount: 400, currency: 'KSH' },
      { description: 'Karosine', amount: 700, currency: 'KSH' },
      { description: 'Petrol', amount: 1500, currency: 'KSH' },
      { description: 'Transport', amount: 4700, currency: 'KSH' }
    ],
    total: 39200,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-recent-2',
    plate: 'KCM923N',
    date: '2026-04-27',
    items: [
      { description: 'Parking fee', amount: 1200, currency: 'KSH' },
      { description: 'Tire opened', amount: 200, currency: 'KSH' },
      { description: 'Air work for air dryer valve', amount: 2000, currency: 'KSH' },
      { description: 'Air work for 6 way valve', amount: 2000, currency: 'KSH' },
      { description: 'Air work for control valve', amount: 1500, currency: 'KSH' },
      { description: 'Air work for compressor', amount: 4000, currency: 'KSH' },
      { description: 'Mechanic for breather', amount: 1000, currency: 'KSH' },
      { description: 'Mechanic for caliper', amount: 600, currency: 'KSH' },
      { description: '2p Dw40', amount: 600, currency: 'KSH' },
      { description: '1m 12m.m pipe', amount: 200, currency: 'KSH' },
      { description: 'Union', amount: 300, currency: 'KSH' },
      { description: 'Hydraulic oil', amount: 350, currency: 'KSH' },
      { description: 'Sandpaper omo water and glue', amount: 300, currency: 'KSH' },
      { description: 'Karosine', amount: 400, currency: 'KSH' },
      { description: 'Augustine door repair', amount: 2500, currency: 'KSH' },
      { description: 'Transport', amount: 3100, currency: 'KSH' }
    ],
    total: 20250,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-4',
    plate: 'UBD577Z',
    date: '2024-06-11',
    items: [
      { description: 'Parking fee', amount: 1000, currency: 'KSH' },
      { description: 'Mechanic for oil service', amount: 1000, currency: 'KSH' },
      { description: 'Wiring', amount: 400, currency: 'KSH' },
      { description: 'Rebit, washer & tie rap', amount: 400, currency: 'KSH' },
      { description: 'H7 bulb & single bulbe', amount: 550, currency: 'KSH' },
      { description: 'Hydrolic oil', amount: 350, currency: 'KSH' }
    ],
    total: 3700,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-5',
    plate: 'SSD682V',
    date: '2024-06-12',
    items: [
      { description: 'Parking fee', amount: 2000, currency: 'KSH' },
      { description: 'Mechanic for Engine brake', amount: 2000, currency: 'KSH' },
      { description: 'Mechanic for radator', amount: 4000, currency: 'KSH' },
      { description: 'Rubber ring for pipe', amount: 450, currency: 'KSH' },
      { description: 'Bolt 3p 16 m.m', amount: 500, currency: 'KSH' },
      { description: 'Clip, tierap, washer & glue', amount: 400, currency: 'KSH' },
      { description: 'Hydrolic oil for kct025f', amount: 350, currency: 'KSH' }
    ],
    total: 9700,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-6',
    plate: 'KCW875R',
    date: '2024-06-22',
    items: [
      { description: 'Faber work', amount: 6000, currency: 'KSH' },
      { description: 'Paint work', amount: 1500, currency: 'KSH' },
      { description: 'Mechanic for exhust flexable', amount: 1000, currency: 'KSH' },
      { description: 'Welding and gas', amount: 4000, currency: 'KSH' },
      { description: 'Polishing', amount: 2500, currency: 'KSH' },
      { description: 'Front wing plastic', amount: 2500, currency: 'KSH' },
      { description: 'Bracket for cheeses', amount: 4000, currency: 'KSH' },
      { description: 'Head light frame', amount: 1500, currency: 'KSH' },
      { description: '2p grill', amount: 3000, currency: 'KSH' }
    ],
    total: 32430,
    currency: 'KSH',
    category: 'maintenance'
  },
  {
    id: 'pay-7',
    plate: 'KDM703F',
    date: '2026-04-29',
    items: [
      { description: 'Parking fee ICD', amount: 200, currency: 'KSH' },
      { description: 'Tire opened', amount: 200, currency: 'KSH' },
      { description: 'Front greasing', amount: 300, currency: 'KSH' },
      { description: 'Drilling', amount: 500, currency: 'KSH' },
      { description: 'Mechanic for oil service', amount: 200, currency: 'KSH' },
      { description: 'Merchanic for spring', amount: 3000, currency: 'KSH' },
      { description: 'Dw40', amount: 300, currency: 'KSH' },
      { description: 'Central bolt', amount: 300, currency: 'KSH' },
      { description: 'Transport', amount: 2900, currency: 'KSH' },
      { description: 'Parking fee ICD balance', amount: 1400, currency: 'KSH' },
      { description: 'Computer dignosis balance', amount: 6000, currency: 'KSH' }
    ],
    total: 15300,
    currency: 'KSH',
    category: 'maintenance'
  }
];
