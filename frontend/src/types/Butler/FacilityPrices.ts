
export interface FacilityPrices{
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
	/**	Facility Type : Link - Facility Type	*/
	facility_type: string
	/**	Facility Price : Currency	*/
	facility_price: number
}