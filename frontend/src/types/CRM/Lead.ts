import { CRMNote } from './CRMNote'

export interface Lead{
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
	/**	Series : Select	*/
	naming_series?: "CRM-LEAD-.YYYY.-"
	/**	Salutation : Link - Salutation	*/
	salutation?: string
	/**	First Name : Data	*/
	first_name?: string
	/**	Middle Name : Data	*/
	middle_name?: string
	/**	Last Name : Data	*/
	last_name?: string
	/**	Full Name : Data	*/
	lead_name?: string
	/**	Job Title : Data	*/
	job_title?: string
	/**	Gender : Link - Gender	*/
	gender?: string
	/**	Source : Link - Lead Source	*/
	source?: string
	/**	Lead Owner : Link - User	*/
	lead_owner?: string
	/**	Status : Select	*/
	status: "Lead" | "Open" | "Replied" | "Opportunity" | "Quotation" | "Lost Quotation" | "Interested" | "Converted" | "Do Not Contact"
	/**	From Customer : Link - Customer	*/
	customer?: string
	/**	Lead Type : Select	*/
	type?: "" | "Client" | "Channel Partner" | "Consultant"
	/**	Request Type : Select	*/
	request_type?: "" | "Product Enquiry" | "Request for Information" | "Suggestions" | "Other"
	/**	Email : Data	*/
	email_id?: string
	/**	Website : Data	*/
	website?: string
	/**	Mobile No : Data	*/
	mobile_no?: string
	/**	WhatsApp : Data	*/
	whatsapp_no?: string
	/**	Phone : Data	*/
	phone?: string
	/**	Phone Ext. : Data	*/
	phone_ext?: string
	/**	Organization Name : Data	*/
	company_name?: string
	/**	No of Employees : Select	*/
	no_of_employees?: "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1000+"
	/**	Annual Revenue : Currency	*/
	annual_revenue?: number
	/**	Industry : Link - Industry Type	*/
	industry?: string
	/**	Market Segment : Link - Market Segment	*/
	market_segment?: string
	/**	Territory : Link - Territory	*/
	territory?: string
	/**	Fax : Data	*/
	fax?: string
	/**	City : Data	*/
	city?: string
	/**	State/Province : Data	*/
	state?: string
	/**	Country : Link - Country	*/
	country?: string
	/**	Qualification Status : Select	*/
	qualification_status?: "Unqualified" | "In Process" | "Qualified"
	/**	Qualified By : Link - User	*/
	qualified_by?: string
	/**	Qualified on : Date	*/
	qualified_on?: string
	/**	Campaign Name : Link - Campaign	*/
	campaign_name?: string
	/**	Company : Link - Company	*/
	company?: string
	/**	Print Language : Link - Language	*/
	language?: string
	/**	Image : Attach Image	*/
	image?: string
	/**	Title : Data	*/
	title?: string
	/**	Disabled : Check	*/
	disabled?: 0 | 1
	/**	Unsubscribed : Check	*/
	unsubscribed?: 0 | 1
	/**	Blog Subscriber : Check	*/
	blog_subscriber?: 0 | 1
	/**	Notes : Table - CRM Note	*/
	notes?: CRMNote[]
}