#!/bin/perl

$First = 1;

printf("[\n");

while(<STDIN>)
{
  if(/^(.*)\|(.*)\|(.*)\|(\S*)\|(\S+)\s*$/)
  {
    $Name  = $1;
    $Text1 = $2;
    $Text2 = $3;
    $Freq  = $4;
    $Mod   = $5;

    if(($Name ne "") && ($Freq ne "") && ($Mod ne ""))
    {
      if($Text1 ne "")
      {
        $Name = $Name . " - " . $Text1;
        #if($Text2 ne "")
        #{
        #  $Name = $Name . ", " . $Text2;
        #}
      }
      elsif($Text2 ne "")
      {
        $Name = $Name . " - " . $Text2;
      }

      if($First) { $First=0; } else { printf(",\n"); }

      # Set FAX frequencies 1.5kHz lower than the carrier
      if(lc($Mod) eq "fax") { $Freq -= 1.5; }

      printf("    {\n");
      printf("        \"name\" : \"%s\",\n", $Name);
      printf("        \"frequency\" : %d,\n", $Freq * 1000);
      printf("        \"modulation\" : \"%s\"\n", lc($Mod));
      printf("    }");
    }
  }
}

printf("\n]\n");
