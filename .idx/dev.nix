{pkgs}: {
  channel = "unstable";
  packages = [
    pkgs.nodejs_24
  ];
  idx.extensions = [
    "angular.ng-template"
  ];
  idx.previews = {
  };
}