import { Loader } from "lucide-react";

export const Spin = ({sm}) => <Loader className={`animate-spin ${sm?"w-4 h-4":"w-5 h-5"}`}/>;
