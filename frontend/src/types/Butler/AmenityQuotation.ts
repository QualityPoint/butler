import { AmenityQuotationItem } from './AmenityQuotationItem'

export interface AmenityQuotation{
	name: string
	creation: string
	modified: string
	owner: string
	modified_by: string
	docstatus: 0 | 1 | 2
	parent?: string
	parentfield?: string
	parenttype?: string
	idx?: number
	/**	Amenity : Link - Amenity	*/
	amenity: string
	/**	Items : Table - Amenity Quotation Item	*/
	items: AmenityQuotationItem[]
}