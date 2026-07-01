import api from '../lib/axios';

export interface AddressResult {
  line1: string;
  line2: string;
  townOrCity: string;
  county: string;
  formatted: string;
}

export const addressApi = {
  lookup: (postcode: string) =>
    api.get<{ addresses: AddressResult[] }>('/address/lookup', { params: { postcode } }).then((r) => r.data.addresses),
};
