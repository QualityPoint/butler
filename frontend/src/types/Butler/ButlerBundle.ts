
export interface ButlerBundle{
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
	/**	Bundle Item : Link - Item - The item must be of a non-stock type	*/
	bundle_item: string
	/**	Bundle Name : Data	*/
	bundle_name: string
	/**	Bundle Price : Currency	*/
	bundle_price: number
	/**	Max Discount (%) : Percent	*/
	max_discount?: number
	/**	Image : Attach Image	*/
	image?: string
	/**	Bundle Info : Text Editor	*/
	bundle_info?: string
}