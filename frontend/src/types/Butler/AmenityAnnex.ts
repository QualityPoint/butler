
export interface AmenityAnnex{
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
	/**	Annex Item : Link - Item - The item must be of a non-stock type	*/
	annex_item: string
	/**	Annex Name : Data	*/
	annex_name: string
	/**	Image : Attach Image	*/
	image?: string
	/**	Description : Small Text	*/
	description?: string
}