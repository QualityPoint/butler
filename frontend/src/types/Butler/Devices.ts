
export interface Devices{
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
	/**	Device Name : Link - Amenity Device	*/
	device_name: string
	/**	Quantity : Int	*/
	qty: number
}