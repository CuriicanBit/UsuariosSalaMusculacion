/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserCategory } from './types';

export const MOCK_USERS = [
  {
    id: 'u1',
    rut: '12.345.678-9',
    fullName: 'Ricardo Contreras',
    category: UserCategory.FUNCIONARIO,
    department: 'Sistemas',
    createdAt: '2024-01-15',
    qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=123456789'
  },
  {
    id: 'u2',
    rut: '23.456.789-0',
    fullName: 'María Silva',
    category: UserCategory.FAMILIAR,
    department: 'Medicina',
    associatedOfficialRut: '11.111.111-1',
    createdAt: '2024-02-20',
    qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=234567890'
  }
];
