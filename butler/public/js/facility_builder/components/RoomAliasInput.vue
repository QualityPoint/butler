<template>
	<!-- The label lives in the component, not in Toolbar.vue, because the field is placed
	     on two different layers and the two must not drift apart. -->
	<div class="fb-alias" :title="title">
		<label class="fb-alias-label" :for="inputId">{{ __("Alias") }}</label>
		<div ref="host" class="fb-alias-field"></div>
	</div>
</template>

<script setup>
import { computed, inject, ref, watch, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({ room: { type: Object, required: true } });
const store = inject("$store");
const host = ref(null);
let ctrl = null;
// Frappe builds the input, so the id has to be handed to it after the fact for the label's
// `for` to reach it — which is what makes clicking "Alias" focus the field.
const inputId = `fb-alias-${frappe.utils.get_random(8)}`;

// A real Frappe Data control, made the same way the Point tool's Icon picker is made a
// few lines up in Toolbar.vue — so it carries the desk's own input markup, focus ring and
// theming, and behaves like every other Data field in the product.
//
// The amenity's name is the control's VALUE, not its placeholder. Placeholder text cannot
// be selected, so seeding it that way left the box looking full of text you could neither
// select nor drag over — which is exactly what an empty Data field must not do. The cost
// is that "unnamed" has to be inferred rather than stored, which `commit` does below.
function display() {
	return props.room.alias || __(props.room.amenity) || "";
}

const title = computed(() =>
	store.read_only.value
		? __("Read only")
		: __("What the customer calls this one. Put {0} back to use the default.", [
				__(props.room.amenity),
		  ])
);

function commit() {
	if (store.read_only.value || !ctrl) return;
	const typed = ctrl.get_value() || "";
	// Compared trimmed, stored as typed. Frappe's own Data fields keep whatever you put in
	// them, so this one does too — the trim is only ever used to decide whether what is in
	// the box counts as a name at all, never to rewrite it.
	//
	// Typing the amenity's own name back in is not an override, it is the default — the
	// same rule `adopt_row_aliases` applies on load, so both agree what "unnamed" means.
	// A box holding nothing but spaces is unnamed too: it cannot be told apart from an
	// empty one by looking at it.
	const bare = typed.trim();
	const alias = !bare || bare === __(props.room.amenity) ? "" : typed;
	// Also what makes a programmatic set_value harmless: Frappe fires df.change from
	// set_value too, and this comparison turns that back into a no-op without needing a
	// re-entrancy flag.
	if (alias === (props.room.alias || "")) return;
	store.set_room_alias(props.room.id, alias);
}

function sync() {
	if (!ctrl) return;
	ctrl.set_value(display());
	ctrl.$input?.prop("disabled", store.read_only.value);
}

onMounted(() => {
	ctrl = frappe.ui.form.make_control({
		parent: host.value,
		df: {
			fieldtype: "Data",
			fieldname: "room_alias",
			placeholder: __("Name this one"),
			change: commit,
		},
		render_input: true,
	});
	// 140 matches the Data column on Butler Quotation Item — better to stop typing at the
	// limit than to let the save truncate it silently.
	ctrl.$input?.attr("id", inputId);
	ctrl.$input?.attr("maxlength", 140);
	ctrl.$input?.attr("spellcheck", "false");
	// Enter commits and steps out, rather than submitting anything.
	ctrl.$input?.on("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			e.target.blur();
		} else if (e.key === "Escape") {
			e.preventDefault();
			ctrl.set_value(display()); // abandon the edit
			e.target.blur();
		}
	});
	sync();
});

// follow the selection, and any change made to the name elsewhere
watch(() => [props.room.id, props.room.alias, store.read_only.value], sync);

onBeforeUnmount(() => {
	ctrl?.$wrapper?.remove();
	ctrl = null;
});
</script>

<style scoped>
/* Compacting a desk control into a 44px toolbar, the same way .fb-icon-field does for the
   Icon picker: the label line is what otherwise pushes the input to the bottom. */
.fb-alias {
	display: flex;
	align-items: center;
	gap: 6px;
}
/* matches the "Opacity" and "Page" labels already in the toolbar */
.fb-alias-label {
	margin: 0;
	color: var(--text-light);
	font-weight: normal;
	white-space: nowrap;
	cursor: pointer;
}
.fb-alias-field {
	width: 170px;
	display: flex;
	align-items: center;
}
.fb-alias-field :deep(.frappe-control),
.fb-alias-field :deep(.form-group),
.fb-alias-field :deep(.control-input-wrapper),
.fb-alias-field :deep(.control-input) {
	margin: 0 !important;
	padding: 0 !important;
	width: 100%;
}
.fb-alias-field :deep(.clearfix),
.fb-alias-field :deep(.control-label),
.fb-alias-field :deep(.help-box) {
	display: none !important;
}
.fb-alias-field :deep(input) {
	height: 26px;
	min-height: 26px;
	font-weight: 600;
	text-overflow: ellipsis;
	/* the toolbar sits between two panes that both suppress selection; say so explicitly
	   here so a drag inside the field selects text rather than doing nothing */
	-webkit-user-select: text;
	user-select: text;
}
</style>
