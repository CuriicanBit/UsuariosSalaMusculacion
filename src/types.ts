/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserCategory {
  FUNCIONARIO = 'Funcionario',
  FAMILIAR = 'Familiar',
}

export interface GymUser {
  id: string;
  rut: string;
  fullName: string;
  category: UserCategory;
  createdAt: string;
  lastAccess?: string;
}

export type ViewType = 'users' | 'printing' | 'config';
