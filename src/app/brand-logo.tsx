import Image from "next/image";

type BrandLogoProps = {
  size?: "compact" | "login";
};

export function BrandLogo({ size = "compact" }: BrandLogoProps) {
  const dimensions =
    size === "login"
      ? { width: 190, height: 117, className: "h-24 w-auto" }
      : { width: 116, height: 72, className: "h-14 w-auto" };

  return (
    <Image
      src="/brand/logo-santegidio.png"
      alt="Comunità di Sant'Egidio"
      width={dimensions.width}
      height={dimensions.height}
      priority={size === "login"}
      className={dimensions.className}
    />
  );
}
