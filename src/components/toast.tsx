import { toast } from "sonner";

export const showToast = (
    title: string,
    description: string,
    buttonLabel: string="Close",
    buttonFunc: () => void = ()=>{}
) => {
    console.log("showToast: ", title, description, buttonLabel)
    toast(title, {
        description,
        action: {
            label: buttonLabel,
            onClick: buttonFunc,
        },
    });
};
