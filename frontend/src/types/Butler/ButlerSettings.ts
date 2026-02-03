
export interface ButlerSettings{
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
	/**	Allow Service Order with Zero Quantity : Check	*/
	allow_zero_qty_in_service_order?: 0 | 1
	/**	Allow Amenity with Zero Quantity in Service Order : Check	*/
	allow_amenity_zero_qty?: 0 | 1
	/**	Allow User to Edit Amenity Price in Service Order : Check	*/
	editable_amenity_price?: 0 | 1
}