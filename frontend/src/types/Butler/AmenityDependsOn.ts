
export interface AmenityDependsOn{
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
	/**	Amenity Price : Currency	*/
	amenity_price?: number
}